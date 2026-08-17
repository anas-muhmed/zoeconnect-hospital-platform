import { useQuery } from '@tanstack/react-query';
import { clinigrowthApi } from '../../lib/api/clinigrowth.api';

export const clinigrowthKeys = {
  all: ['clinigrowth'] as const,
  vitals: (mrno: string) => [...clinigrowthKeys.all, 'vitals', mrno] as const,
};

/**
 * Fetches growth-chart vitals for a patient by MRN. `enabled: !!mrno` so
 * nothing fires until the user actually submits a search — this is a
 * search-driven module, not a list-on-load one.
 */
export const useClinigrowthVitals = (mrno: string) => {
  return useQuery({
    queryKey: clinigrowthKeys.vitals(mrno),
    queryFn: () => clinigrowthApi.getPatientVitals(mrno),
    enabled: !!mrno,
    retry: false, // 404 (patient not found) / 503 (HIS unavailable) are not transient — don't retry
  });
};
