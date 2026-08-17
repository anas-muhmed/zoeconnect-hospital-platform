import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { useGrowchart } from "./GrowchartContext";
import { generateId } from "./idGen";

interface Visit {
  id: string;
  visitNumber: number;
  date: Date | null;
  height: string;
  weight: string;
  headCirc: string;
}

// Helper function to calculate chronological age in weeks
function calculateChronologicalAge(dob: Date | null, visitDate: Date | null): number | null {
  if (!dob || !visitDate) return null;
  const diffTime = visitDate.getTime() - dob.getTime();
  const diffDays = diffTime / (1000 * 60 * 60 * 24);
  return diffDays / 7; // Convert to weeks
}

// Helper function to calculate corrected gestational week
function calculateCorrectedGestationalWeek(gaAtBirth: string, chronologicalAge: number | null): number | null {
  if (!gaAtBirth || chronologicalAge === null) return null;
  const gaAtBirthNum = parseFloat(gaAtBirth);
  if (isNaN(gaAtBirthNum)) return null;
  return gaAtBirthNum + chronologicalAge;
}

// Custom input component with calendar icon
// NOTE: react-datepicker clones this element and injects its own `onChange`
// handler which expects a change EVENT, not a Date. That means we can never
// rely on an `onChange` prop here to report a manually-typed date back up.
// Instead we accept an explicit `onManualDateChange(date: Date | null)` prop
// that WE control fully, and use that for both DOB and Visit date fields.
function DateInputWithIcon({
  value,
  onClick,
  onManualDateChange,
}: {
  value?: Date | string | null;
  onClick?: () => void;
  onManualDateChange: (date: Date | null) => void;
}) {
  const [inputValue, setInputValue] = useState('');
  const [isDateSaved, setIsDateSaved] = useState(false);

  // Format Date object to DD/MM/YYYY string
  const formatDate = (date: Date | null | string | undefined): string => {
    if (!date) return '';
    if (typeof date === 'string') return date;
    if (date instanceof Date) {
      const d = date.getDate().toString().padStart(2, '0');
      const m = (date.getMonth() + 1).toString().padStart(2, '0');
      const y = date.getFullYear();
      return `${d}/${m}/${y}`;
    }
    return '';
  };

  // Initialize with the value prop (Date object)
  useEffect(() => {
    setInputValue(formatDate(value));
    setIsDateSaved(!!value);
  }, [value]);

  const tryParseAndSave = (digits: string) => {
    if (digits.length === 8) {
      const day = parseInt(digits.slice(0, 2));
      const month = parseInt(digits.slice(2, 4)) - 1; // JS months are 0-indexed
      const year = parseInt(digits.slice(4, 8));

      const parsedDate = new Date(year, month, day);
      // Guard against invalid dates like 31/02/2024 silently rolling over
      const isValidCalendarDate =
        !isNaN(parsedDate.getTime()) &&
        parsedDate.getDate() === day &&
        parsedDate.getMonth() === month &&
        parsedDate.getFullYear() === year;

      if (isValidCalendarDate) {
        onManualDateChange(parsedDate);
        setIsDateSaved(true);
        return;
      }
    }
    setIsDateSaved(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value;
    let digits = input.replace(/\D/g, ''); // Remove non-digits

    // Auto-format as DD/MM/YYYY
    let formatted = '';
    if (digits.length >= 1) {
      formatted += digits.slice(0, 2);
    }
    if (digits.length >= 3) {
      formatted += '/' + digits.slice(2, 4);
    }
    if (digits.length >= 5) {
      formatted += '/' + digits.slice(4, 8);
    }

    setInputValue(formatted);
    setIsDateSaved(false);

    // Try to parse the complete date and update immediately
    tryParseAndSave(digits);
  };

  const handleBlur = () => {
    // When the input loses focus, try to parse the current value
    tryParseAndSave(inputValue.replace(/\D/g, ''));
  };

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <input
        value={inputValue}
        onChange={handleInputChange}
        onBlur={handleBlur}
        placeholder="DD/MM/YYYY"
        className="date-picker-input"
        style={{
          paddingRight: isDateSaved ? '70px' : '40px',
          borderColor: isDateSaved ? '#10b981' : undefined,
        }}
      />
      {isDateSaved && (
        <div
          style={{
            position: 'absolute',
            right: '40px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: '#10b981',
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </div>
      )}
      <div
        onClick={(e) => {
          e.stopPropagation();
          onClick && onClick();
        }}
        style={{
          position: 'absolute',
          right: '12px',
          top: '50%',
          transform: 'translateY(-50%)',
          cursor: 'pointer',
        }}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#64748b"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="16" y1="2" x2="16" y2="6"></line>
          <line x1="8" y1="2" x2="8" y2="6"></line>
          <line x1="3" y1="10" x2="21" y2="10"></line>
        </svg>
      </div>
    </div>
  );
}

export default function AddPatient() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setPatient, patient, setPatientWho, patientWho, setHomeForm, setHomeFormWho } = useGrowchart();
  const isEditMode = location.pathname === "/edit-patient";

  const [chartType, setChartType] = useState<"fenton" | "who">(() => {
    return (localStorage.getItem("gc_chartType") as "fenton" | "who") || "fenton";
  });

  const previousChartType = chartType;
  const isWhoMode = chartType === "who";
  const currentPatient = isWhoMode ? patientWho : patient;
  const setCurrentPatient = isWhoMode ? setPatientWho : setPatient;

  // Debug: log which mode we're in
  console.log('AddPatient mode:', { isWhoMode, chartType, hasPatientWho: !!patientWho, hasPatient: !!patient });

  const [mrn, setMrn] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [mrnError, setMrnError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    patientName: "",
    gender: "male" as "male" | "female",
    dob: null as Date | null,
    gaAtBirth: "",
    termWeek: 50,
  });

  const [nextVisitNumber, setNextVisitNumber] = useState(2);
  const [visits, setVisits] = useState<Visit[]>([
    { id: generateId(), visitNumber: 1, date: null, height: "", weight: "", headCirc: "" }
  ]);

  // Load existing patient data in edit mode
  useEffect(() => {
    const savedType = localStorage.getItem("gc_chartType") as "fenton" | "who";
    if (savedType) setChartType(savedType);

    if (isEditMode && (patient || patientWho)) {
      const p = currentPatient || patient || patientWho;
      if (p) {
        setFormData({
          patientName: p.patientName,
          gender: p.gender as "male" | "female",
          dob: p.dob ? new Date(p.dob) : null,
          gaAtBirth: p.gaAtBirth,
          termWeek: 50,
        });
        if (p.visits.length > 0) {
          const loadedVisits = p.visits.map((v, i) => ({
            ...v,
            visitNumber: (v as any).visitNumber || (i + 1),
            date: v.date ? new Date(v.date) : null
          }));
          setVisits(loadedVisits);
          const maxNum = Math.max(...loadedVisits.map(v => v.visitNumber), loadedVisits.length);
          setNextVisitNumber(maxNum + 1);
        }
      }
    }
  }, [isEditMode, currentPatient]);

  const handleFetchVitals = async () => {
    const trimmedMrn = mrn.trim();
    if (!trimmedMrn) return;

    setIsLoading(true);
    setMrnError(null);

    try {
      // ZoeConnect integration bridge: mounted inside the main ZoeConnect
      // app (same origin), this calls ZoeConnect's already-integrated
      // backend directly (VITE_API_BASE_URL='/api/v1/clinigrowth', set at
      // build time -- see client/.env) and attaches the shared ZoeConnect
      // session's token (sessionStorage's 'hdsp-auth' key, Zustand persist
      // -- see frontend's auth.store.ts), since this endpoint requires
      // authentication there and this app never had its own login system.
      const baseUrl = (import.meta as any).env?.VITE_API_BASE_URL || "";
      let authHeaders: Record<string, string> = {};
      try {
        const raw = sessionStorage.getItem('hdsp-auth');
        const token = raw ? JSON.parse(raw)?.state?.token : null;
        if (token) authHeaders = { Authorization: `Bearer ${token}` };
      } catch { /* no ZoeConnect session available -- request goes out unauthenticated */ }
      const response = await fetch(`${baseUrl}/patients/${encodeURIComponent(trimmedMrn)}/vitals`, { headers: authHeaders });

      if (response.status === 404) {
        const errData = await response.json().catch(() => null);
        setMrnError(errData?.error || "No patient found for this MRN");
        return;
      }

      if (response.status === 502) {
        setMrnError("Backend API server is offline or unreachable (502)");
        return;
      }

      const contentType = response.headers.get("content-type");
      if (!response.ok || !contentType || !contentType.includes("application/json")) {
        let errorMessage = "Failed to fetch patient vitals";
        if (contentType && contentType.includes("application/json")) {
          const errData = await response.json().catch(() => null);
          if (errData?.error) errorMessage = errData.error;
        } else if (!response.ok) {
          errorMessage = `Failed to fetch patient vitals (${response.status})`;
        }
        setMrnError(errorMessage);
        return;
      }

      const data = await response.json();
      const { patient, visits: fetchedVisits } = data;

      const nameParts = [patient?.firstName, patient?.middleName, patient?.lastName]
        .filter((part) => part && String(part).trim() !== "");
      const patientName = nameParts.join(" ");

      let gender: "male" | "female" = "male";
      if (patient?.gender === "female") {
        gender = "female";
      } else if (patient?.gender === "male") {
        gender = "male";
      }

      let dob: Date | null = null;
      if (patient?.dob) {
        const parsedDob = new Date(patient.dob);
        if (!isNaN(parsedDob.getTime())) {
          dob = parsedDob;
        }
      }

      setFormData((prev) => ({
        ...prev,
        patientName: patientName || prev.patientName,
        gender,
        dob: dob || prev.dob,
      }));

      if (Array.isArray(fetchedVisits) && fetchedVisits.length > 0) {
        const mappedVisits: Visit[] = fetchedVisits.map((v: any, index: number) => {
          let visitDate: Date | null = null;
          if (v.enteredDatetime) {
            const parsed = new Date(v.enteredDatetime);
            if (!isNaN(parsed.getTime())) {
              visitDate = parsed;
            }
          }
          return {
            id: generateId(),
            visitNumber: index + 1,
            date: visitDate,
            height: v.height != null ? String(v.height) : "",
            weight: v.weight != null ? String(v.weight) : "",
            headCirc: v.headCircumference != null ? String(v.headCircumference) : "",
          };
        });

        setVisits(mappedVisits);
        setNextVisitNumber(mappedVisits.length + 1);
      }
      setMrnError(null);
    } catch (err) {
      console.error("Error fetching patient vitals:", err);
      setMrnError("Failed to fetch patient vitals");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const formattedDob = formData.dob ? formData.dob.toISOString().split('T')[0] : "";
    const formattedVisits = visits.map(v => ({
      ...v,
      date: v.date instanceof Date ? v.date.toISOString().split('T')[0] : ""
    }));

    const patientData = {
      patientName: formData.patientName,
      gender: formData.gender,
      dob: formattedDob,
      gaAtBirth: formData.gaAtBirth,
      visits: formattedVisits,
    };

    // Save to both patient contexts so data is synchronized
    setPatient(patientData);
    setPatientWho(patientData);

    setHomeForm({
      patientName: formData.patientName,
      dob: formattedDob,
      gender: formData.gender,
      gaAtBirth: formData.gaAtBirth,
      visits: formattedVisits,
      plotted: true,
    });

    setHomeFormWho({
      patientName: formData.patientName,
      dob: formattedDob,
      gender: formData.gender,
      gaAtBirth: formData.gaAtBirth,
      visits: formattedVisits,
      plotted: true,
    });

    // Save chart type preference
    localStorage.setItem("gc_chartType", chartType);
    localStorage.setItem("gc_patientName", formData.patientName);
    localStorage.setItem("gc_dob", formattedDob);
    localStorage.setItem("gc_gender", formData.gender);
    localStorage.setItem("gc_gaAtBirth", formData.gaAtBirth);
    localStorage.setItem("gc_visits", JSON.stringify(formattedVisits));

    // Navigate to appropriate view based on selected chart standard
    navigate(chartType === "who" ? "/detail" : "/");
  };

  const handleReset = () => {
    if (!window.confirm("Reset the form? All entered data will be cleared.")) {
      return;
    }

    setMrn("");
    setMrnError(null);
    setIsLoading(false);

    // Clear any persisted growth-chart data from localStorage (e.g. "gc_chartType")
    Object.keys(localStorage)
      .filter((key) => key.startsWith("gc_"))
      .forEach((key) => localStorage.removeItem(key));

    // Clear the saved patient in context too, so a stale record isn't
    // picked back up on next visit/navigation
    setCurrentPatient({
      patientName: "",
      gender: "male",
      dob: "",
      gaAtBirth: "",
      visits: [],
    });

    setFormData({
      patientName: "",
      gender: "male",
      dob: null,
      gaAtBirth: "",
      termWeek: 50,
    });
    setVisits([
      { id: generateId(), visitNumber: 1, date: null, height: "", weight: "", headCirc: "" }
    ]);
    setNextVisitNumber(2);
  };

  return (
    <div style={s.container}>
      <style>{`
        .date-picker-input {
          padding: 12px 16px;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          font-size: 14px;
          width: 100%;
          box-sizing: border-box;
          transition: border-color 0.2s, box-shadow 0.2s;
          background-color: #fff;
        }
        .date-picker-input:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }
        .react-datepicker-wrapper {
          width: 100%;
        }
        .react-datepicker__input-container input {
          width: 100%;
        }
      `}</style>
      <div style={s.card}>
        <h1 style={s.title}>{isEditMode ? "Edit Patient" : "Add New Patient"}</h1>
        <p style={s.subtitle}>{isEditMode ? "Update patient information and visits" : "Enter patient information to begin growth tracking"}</p>

        <form onSubmit={handleSubmit} style={s.form}>
          <div style={s.formGroup}>
            <label style={s.label}>MRN</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                value={mrn}
                onChange={(e) => {
                  setMrn(e.target.value);
                  if (mrnError) setMrnError(null);
                }}
                placeholder="Enter MRN"
                style={{ ...s.input, flex: 1 }}
              />
              <button
                type="button"
                onClick={handleFetchVitals}
                disabled={isLoading || !mrn.trim()}
                style={{
                  ...s.fetchBtn,
                  opacity: isLoading || !mrn.trim() ? 0.6 : 1,
                  cursor: isLoading || !mrn.trim() ? "not-allowed" : "pointer",
                }}
              >
                {isLoading ? "Fetching..." : "Fetch"}
              </button>
            </div>
            {mrnError && <p style={s.errorText}>{mrnError}</p>}
          </div>

          <div style={s.formGroup}>
            <label style={s.label}>Patient Name</label>
            <input
              type="text"
              value={formData.patientName}
              onChange={(e) => setFormData({ ...formData, patientName: e.target.value })}
              placeholder="Enter patient name"
              style={s.input}
              required
            />
          </div>

          <div style={s.formGroup}>
            <label style={s.label}>Gender</label>
            <div style={s.genderOptions}>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, gender: "male" })}
                style={{
                  ...s.genderButton,
                  ...(formData.gender === "male" ? s.genderButtonActive : {}),
                }}
              >
                <span style={{ fontSize: 20 }}>♂</span>
                <span>Male</span>
              </button>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, gender: "female" })}
                style={{
                  ...s.genderButton,
                  ...(formData.gender === "female" ? s.genderButtonActive : {}),
                }}
              >
                <span style={{ fontSize: 20 }}>♀</span>
                <span>Female</span>
              </button>
            </div>
          </div>

          <div style={s.formGroup}>
            <label style={s.label}>Date of Birth</label>
            <DatePicker
              selected={formData.dob}
              onChange={(date: Date | null) => setFormData({ ...formData, dob: date })}
              dateFormat="dd/MM/yyyy"
              placeholderText="DD/MM/YYYY"
              showMonthDropdown
              showYearDropdown
              scrollableYearDropdown
              yearDropdownItemNumber={100}
              maxDate={new Date()}
              customInput={
                <DateInputWithIcon
                  onManualDateChange={(date: Date | null) =>
                    setFormData((prev) => ({ ...prev, dob: date }))
                  }
                />
              }
              required
            />
          </div>

          <div style={s.formGroup}>
            <label style={s.label}>Gestational Age at Birth (weeks)</label>
            <input
              type="number"
              value={formData.gaAtBirth}
              onChange={(e) => setFormData({ ...formData, gaAtBirth: e.target.value })}
              onWheel={(e) => e.currentTarget.blur()}
              placeholder="e.g., 32"
              min="22"
              max="44"
              step="0.5"
              style={s.input}
              required
            />
          </div>

          <div style={s.formGroup}>
            <label style={s.label}>Growth Chart Standard</label>
            <div style={s.genderOptions}>
              <button
                type="button"
                onClick={() => setChartType("fenton")}
                style={{
                  ...s.genderButton,
                  ...(chartType === "fenton" ? s.genderButtonActive : {}),
                }}
              >
                <span style={{ fontSize: 18 }}>📈</span>
                <span>Preterm</span>
              </button>
              <button
                type="button"
                onClick={() => setChartType("who")}
                style={{
                  ...s.genderButton,
                  ...(chartType === "who" ? s.genderButtonActive : {}),
                }}
              >
                <span style={{ fontSize: 18 }}>📊</span>
                <span>Term - Postterm</span>
              </button>
            </div>
            <p style={s.helpText}>
              {chartType === "fenton"
                ? "First 50 weeks CGA plot on Fenton Preterm Chart, subsequent visits on WHO Chart."
                : "ALL visits plot exclusively on WHO Growth Chart regardless of age."}
            </p>
          </div>

          {chartType === "fenton" && (
            <div style={s.formGroup}>
              <label style={s.label}>Fenton up to week</label>
              <input
                type="number"
                value={formData.termWeek}
                onChange={(e) => setFormData({ ...formData, termWeek: parseInt(e.target.value) || 50 })}
                onWheel={(e) => e.currentTarget.blur()}
                placeholder="e.g., 50"
                min="22"
                max="50"
                step="1"
                style={s.input}
                required
              />
              <p style={s.helpText}>Maximum gestational age for Fenton chart (22-50 weeks)</p>
            </div>
          )}

          <div style={s.divider} />
          <div style={s.buttonGroup}>
            <button
              type="button"
              onClick={() => navigate("/")}
              style={s.cancelButton}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleReset}
              style={s.resetButton}
            >
              Reset
            </button>
            <button type="submit" style={s.submitButton}>
              {isEditMode ? "Update Patient" : "Add Patient"}
            </button>
          </div>

          <div style={s.visitsHeader}>
            <h3 style={s.sectionTitle}>Visits</h3>
            <button
              type="button"
              onClick={() => {
                setVisits([
                  ...visits,
                  { id: generateId(), visitNumber: nextVisitNumber, date: null, height: "", weight: "", headCirc: "" }
                ]);
                setNextVisitNumber(prev => prev + 1);
              }}
              style={s.addBtn}
            >
              + Add Visit
            </button>
          </div>

          <div style={s.visitList}>
            {visits.slice().reverse().map((visit) => (
              <div key={visit.id} style={s.visitCard}>
                <div style={s.visitCardHeader}>
                  <span style={s.visitLabel}>Visit #{visit.visitNumber}</span>
                  {visits.length > 1 && (
                    <button type="button" onClick={() => setVisits(visits.filter(v => v.id !== visit.id))} style={s.removeBtn}>Remove</button>
                  )}
                </div>
                <div style={s.formGroup}>
                  <label style={s.label}>Date of Examination</label>
                  <DatePicker
                    selected={visit.date}
                    onChange={(date: Date | null) => {
                      const updated = visits.map(v => v.id === visit.id ? { ...v, date } : v);
                      setVisits(updated);
                    }}
                    dateFormat="dd/MM/yyyy"
                    placeholderText="DD/MM/YYYY"
                    showMonthDropdown
                    showYearDropdown
                    scrollableYearDropdown
                    yearDropdownItemNumber={100}
                    minDate={formData.dob || undefined}
                    maxDate={new Date()}
                    customInput={
                      <DateInputWithIcon
                        onManualDateChange={(date: Date | null) => {
                          setVisits((prevVisits) =>
                            prevVisits.map(v => v.id === visit.id ? { ...v, date } : v)
                          );
                        }}
                      />
                    }
                  />
                  {visit.date && formData.dob && formData.gaAtBirth && (() => {
                    const chronologicalAge = calculateChronologicalAge(formData.dob, visit.date);
                    const correctedGestationalWeek = calculateCorrectedGestationalWeek(formData.gaAtBirth, chronologicalAge);
                    return (
                      <div style={s.calculatedFields}>
                        <div style={s.calculatedField}>
                          <span style={s.calculatedLabel}>Chronological Age:</span>
                          <span style={s.calculatedValue}>
                            {chronologicalAge !== null ? `${chronologicalAge.toFixed(1)} weeks` : '-'}
                          </span>
                        </div>
                        <div style={s.calculatedField}>
                          <span style={s.calculatedLabel}>Post-Menstrual Age (PMA):</span>
                          <span style={s.calculatedValue}>
                            {correctedGestationalWeek !== null ? `${correctedGestationalWeek.toFixed(1)} weeks` : '-'}
                          </span>
                        </div>
                      </div>
                    );
                  })()}
                </div>


                <div style={s.row}>
                  <div style={{ ...s.formGroup, flex: 1 }}>
                    <label style={s.label}>Weight (kg)</label>
                    <input
                      type="number"
                      step="0.001"
                      value={visit.weight}
                      onChange={(e) => {
                        const updated = visits.map(v => v.id === visit.id ? { ...v, weight: e.target.value } : v);
                        setVisits(updated);
                      }}
                      style={s.input}
                      onWheel={(e) => e.currentTarget.blur()}
                      placeholder="0.00"
                    />
                  </div>
                  <div style={{ ...s.formGroup, flex: 1 }}>
                    <label style={s.label}>Length (cm)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={visit.height}
                      onChange={(e) => {
                        const updated = visits.map(v => v.id === visit.id ? { ...v, height: e.target.value } : v);
                        setVisits(updated);
                      }}
                      style={s.input}
                      onWheel={(e) => e.currentTarget.blur()}
                      placeholder="0.0"
                    />
                  </div>
                </div>
                <div style={s.formGroup}>
                  <label style={s.label}>Head Circumference (cm)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={visit.headCirc}
                    onChange={(e) => {
                      const updated = visits.map(v => v.id === visit.id ? { ...v, headCirc: e.target.value } : v);
                      setVisits(updated);
                    }}
                    style={s.input}
                    onWheel={(e) => e.currentTarget.blur()}
                    placeholder="0.0"
                  />
                </div>
              </div>
            ))}
          </div>

          {/* <div style={s.buttonGroup}>
            <button
              type="button"
              onClick={() => navigate("/")}
              style={s.cancelButton}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleReset}
              style={s.resetButton}
            >
              Reset
            </button>
            <button type="submit" style={s.submitButton}>
              {isEditMode ? "Update Patient" : "Add Patient"}
            </button>
          </div> */}
        </form>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    minHeight: "100vh",
    backgroundColor: "#f8fafc",
    padding: "20px",
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
    padding: "40px",
    width: "100%",
    maxWidth: "480px",
  },
  title: {
    fontSize: 28,
    fontWeight: 800,
    color: "#1e293b",
    margin: "0 0 8px 0",
  },
  subtitle: {
    fontSize: 14,
    color: "#64748b",
    margin: "0 0 32px 0",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: 24,
  },
  formGroup: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: 600,
    color: "#475569",
  },
  input: {
    padding: "12px 16px",
    borderRadius: 8,
    border: "1px solid #e2e8f0",
    fontSize: 14,
    transition: "border-color 0.2s",
    width: "100%",
    boxSizing: "border-box",
  },
  fetchBtn: {
    padding: "12px 20px",
    borderRadius: 8,
    border: "none",
    backgroundColor: "#3b82f6",
    color: "#fff",
    fontSize: 14,
    fontWeight: 600,
    whiteSpace: "nowrap",
    transition: "all 0.2s",
  },
  errorText: {
    fontSize: 12,
    color: "#ef4444",
    margin: "4px 0 0 0",
  },
  helpText: {
    fontSize: 11,
    color: "#94a3b8",
    margin: "4px 0 0 0",
  },
  calculatedFields: {
    marginTop: 8,
    padding: 12,
    backgroundColor: "#f0f9ff",
    borderRadius: 6,
    border: "1px solid #bae6fd",
  },
  calculatedField: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: 4,
    fontSize: 12,
  },
  calculatedLabel: {
    color: "#475569",
    fontWeight: 500,
  },
  calculatedValue: {
    color: "#0284c7",
    fontWeight: 600,
  },
  divider: {
    borderTop: "1px solid #e2e8f0",
    margin: "24px 0",
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: "#0f172a",
    margin: 0,
  },
  visitsHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  addBtn: {
    padding: "6px 12px",
    backgroundColor: "#3b82f6",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  },
  visitList: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  visitCard: {
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    padding: 16,
    backgroundColor: "#f8fafc",
  },
  visitCardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  visitLabel: {
    fontSize: 13,
    fontWeight: 700,
    color: "#0f172a",
  },
  removeBtn: {
    background: "none",
    border: "none",
    color: "#ef4444",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 500,
  },
  row: {
    display: "flex",
    gap: 12,
  },
  genderOptions: {
    display: "flex",
    gap: 12,
  },
  genderButton: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "12px",
    borderRadius: 8,
    border: "1px solid #e2e8f0",
    backgroundColor: "#fff",
    fontSize: 14,
    fontWeight: 500,
    color: "#64748b",
    cursor: "pointer",
    transition: "all 0.2s",
  },
  genderButtonActive: {
    borderColor: "#3b82f6",
    backgroundColor: "#eff6ff",
    color: "#3b82f6",
    fontWeight: 600,
  },
  buttonGroup: {
    display: "flex",
    gap: 12,
    marginTop: 8,
  },
  cancelButton: {
    flex: 1,
    padding: "12px 24px",
    borderRadius: 8,
    border: "1px solid #e2e8f0",
    backgroundColor: "#fff",
    fontSize: 14,
    fontWeight: 600,
    color: "#64748b",
    cursor: "pointer",
    transition: "all 0.2s",
  },
  resetButton: {
    flex: 1,
    padding: "12px 24px",
    borderRadius: 8,
    border: "1px solid #fca5a5",
    backgroundColor: "#fff",
    fontSize: 14,
    fontWeight: 600,
    color: "#ef4444",
    cursor: "pointer",
    transition: "all 0.2s",
  },
  submitButton: {
    flex: 1,
    padding: "12px 24px",
    borderRadius: 8,
    border: "none",
    backgroundColor: "#3b82f6",
    fontSize: 14,
    fontWeight: 600,
    color: "#fff",
    cursor: "pointer",
    transition: "all 0.2s",
  },
};