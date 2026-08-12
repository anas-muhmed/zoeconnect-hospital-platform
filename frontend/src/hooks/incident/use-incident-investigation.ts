import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { incidentApi } from '../../lib/api/incident.api';
import { IncidentInvestigation, IncidentStatement, IncidentRca, IncidentCapa, VerificationOutcome, RcaFiveWhy, RcaFishboneNode } from '../../types/incident.types';
export const incidentKeys = {
  // Inheriting from use-incident might cause circular dep, so we'll just redefine the sub-keys locally
  investigations: (incidentId: string) => ['incidents', 'detail', incidentId, 'investigations'] as const,
  rcas: (incidentId: string) => ['incidents', 'detail', incidentId, 'rcas'] as const,
  capas: (incidentId: string) => ['incidents', 'detail', incidentId, 'capas'] as const,
  verifications: (incidentId: string) => ['incidents', 'detail', incidentId, 'verifications'] as const,
  detail: (incidentId: string) => ['incidents', 'detail', incidentId] as const,
  timeline: (incidentId: string) => ['incidents', 'detail', incidentId, 'timeline'] as const,
  statements: (incidentId: string, invId: string) => ['incidents', 'detail', incidentId, 'investigations', invId, 'statements'] as const,
  fiveWhys: (incidentId: string, rcaId: string) => ['incidents', 'detail', incidentId, 'rcas', rcaId, 'fiveWhys'] as const,
  fishbone: (incidentId: string, rcaId: string) => ['incidents', 'detail', incidentId, 'rcas', rcaId, 'fishbone'] as const,
};

// ── Queries ───────────────────────────────────────────────────────────────────

export const useIncidentInvestigations = (incidentId: string) => {
  return useQuery({
    queryKey: incidentKeys.investigations(incidentId),
    queryFn: () => incidentApi.getInvestigations(incidentId),
    enabled: !!incidentId,
  });
};

export const useIncidentInvestigationStatements = (incidentId: string, invId: string) => {
  return useQuery({
    queryKey: incidentKeys.statements(incidentId, invId),
    queryFn: () => incidentApi.getStatements(incidentId, invId),
    enabled: !!incidentId && !!invId,
  });
};

export const useIncidentRcas = (incidentId: string) => {
  return useQuery({
    queryKey: incidentKeys.rcas(incidentId),
    queryFn: () => incidentApi.getRcas(incidentId),
    enabled: !!incidentId,
  });
};

export const useIncidentFiveWhys = (incidentId: string, rcaId: string) => {
  return useQuery({
    queryKey: [...incidentKeys.rcas(incidentId), rcaId, 'five-why'],
    queryFn: () => incidentApi.getFiveWhys(incidentId, rcaId),
    enabled: !!incidentId && !!rcaId,
  });
};

export const useIncidentFishbone = (incidentId: string, rcaId: string) => {
  return useQuery({
    queryKey: [...incidentKeys.rcas(incidentId), rcaId, 'fishbone'],
    queryFn: () => incidentApi.getFishbone(incidentId, rcaId),
    enabled: !!incidentId && !!rcaId,
  });
};

export const useIncidentCapas = (incidentId: string) => {
  return useQuery({
    queryKey: incidentKeys.capas(incidentId),
    queryFn: () => incidentApi.getCapas(incidentId),
    enabled: !!incidentId,
  });
};

export const useIncidentVerifications = (incidentId: string) => {
  return useQuery({
    queryKey: incidentKeys.verifications(incidentId),
    queryFn: () => incidentApi.getVerifications(incidentId),
    enabled: !!incidentId,
  });
};

// ── Investigations ────────────────────────────────────────────────────────────

export const useCreateInvestigation = (incidentId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<IncidentInvestigation>) => incidentApi.createInvestigation(incidentId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: incidentKeys.investigations(incidentId) });
      queryClient.invalidateQueries({ queryKey: incidentKeys.timeline(incidentId) });
    },
  });
};

export const useUpdateInvestigation = (incidentId: string, invId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<IncidentInvestigation>) => incidentApi.updateInvestigation(incidentId, invId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: incidentKeys.investigations(incidentId) });
    },
  });
};

export const useAddStatement = (incidentId: string, invId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<IncidentStatement>) => incidentApi.addStatement(incidentId, invId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: incidentKeys.detail(incidentId) });
      queryClient.invalidateQueries({ queryKey: incidentKeys.statements(incidentId, invId) });
    },
  });
};

// ── RCA ───────────────────────────────────────────────────────────────────────

export const useCreateRca = (incidentId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<IncidentRca>) => incidentApi.createRca(incidentId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: incidentKeys.detail(incidentId) });
      // Bug fix (rca-capa-tab-reset, 2026-07-31): `useIncidentRcas()` (the
      // query backing the RCA tab's list) reads `incidentKeys.rcas(...)`,
      // not `detail(...)` -- invalidating only `detail` left the RCA tab
      // showing stale data after create, which is exactly why the page used
      // to bypass this hook and force a full `window.location.reload()`
      // instead (see IncidentDetailPage's RcaTabContent). That reload
      // remounted the whole page and reset its tab state back to Overview
      // as a side effect. Invalidating the actual query this data belongs to
      // makes the reload unnecessary.
      queryClient.invalidateQueries({ queryKey: incidentKeys.rcas(incidentId) });
    },
  });
};

export const useUpdateRca = (incidentId: string, rcaId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<IncidentRca>) => incidentApi.updateRca(incidentId, rcaId, data),
    onSuccess: () => {
      // Bug fix (rca-complete-stale-list, 2026-07-31): marking an RCA
      // COMPLETED flips the incident's status server-side (RCA_PENDING ->
      // CAPA_PENDING) immediately, but this app defines the query key
      // namespace for incidents TWICE -- once in use-incident.ts (with a
      // `lists()` entry for the Incident Management table) and again,
      // separately, right here in this file (comment above literally says
      // "we'll just redefine the sub-keys locally"). Invalidating only the
      // narrow keys redefined in *this* file left the list page holding
      // its cached "RCA Pending" row for up to `staleTime` (60s) -- and
      // since `refetchOnWindowFocus` is off and nothing else nudges that
      // query, it could sit stale far longer than that, which is what
      // read as a multi-minute delay.
      //
      // Invalidating the shared `['incidents']` prefix instead matches
      // every query under it (list, detail, rcas, capas, dashboard, ...)
      // regardless of which file defined the key, so the incident table,
      // this detail page, and the RCA tab all refresh immediately.
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
    },
  });
};

export const useAddFiveWhy = (incidentId: string, rcaId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => { // Using any to avoid importing FiveWhyInput here or just passing the form data
      // 1. Update RCA with summary and root cause
      await incidentApi.updateRca(incidentId, rcaId, { 
        summary: data.problemStatement, 
        rootCause: data.rootCause 
      });

      // 2. Add each populated why
      const whys = [data.why1, data.why2, data.why3, data.why4, data.why5];
      for (let i = 0; i < whys.length; i++) {
        if (whys[i]) {
          await incidentApi.addFiveWhy(incidentId, rcaId, {
            whyNumber: i + 1,
            whyText: whys[i] as string,
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: incidentKeys.detail(incidentId) });
      queryClient.invalidateQueries({ queryKey: incidentKeys.fiveWhys(incidentId, rcaId) });
    },
  });
};

export const useUpsertFishbone = (incidentId: string, rcaId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<RcaFishboneNode>) => incidentApi.upsertFishbone(incidentId, rcaId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: incidentKeys.detail(incidentId) });
    },
  });
};

// ── CAPA & Verification ───────────────────────────────────────────────────────

export const useCreateCapa = (incidentId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<IncidentCapa>) => incidentApi.createCapa(incidentId, data),
    // Bug fix (rca-complete-stale-list, 2026-07-31): see useUpdateRca's doc
    // comment above -- invalidate the shared `['incidents']` prefix so the
    // Incident Management table isn't left showing a stale status/stage.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['incidents'] }),
  });
};

export const useUpdateCapa = (incidentId: string, capaId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<IncidentCapa>) => incidentApi.updateCapa(incidentId, capaId, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['incidents'] }),
  });
};

export const useVerifyCapa = (incidentId: string, capaId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { outcome: VerificationOutcome; notes?: string }) => incidentApi.verifyCapa(incidentId, capaId, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['incidents'] }),
  });
};
