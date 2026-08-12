export const INCIDENT_ROUTES = {
  LIST: '/incident',
  NEW: '/incident/new',
  DASHBOARD: '/incident/dashboard',
  ANALYTICS: '/incident/analytics',
  SETTINGS: '/incident/settings',
  
  DETAIL: (id: string) => `/incident/${id}`,
  INVESTIGATION: (id: string) => `/incident/${id}/investigation`,
  RCA: (id: string) => `/incident/${id}/rca`,
  CAPA: (id: string) => `/incident/${id}/capa`,
  VERIFICATION: (id: string) => `/incident/${id}/verification`,
  TIMELINE: (id: string) => `/incident/${id}/timeline`,
};
