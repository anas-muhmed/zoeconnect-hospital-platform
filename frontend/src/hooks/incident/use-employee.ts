import { useQuery } from '@tanstack/react-query';
import { incidentApi } from '../../lib/api/incident.api';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

/**
 * Resolves a stored user/employee UUID (reporter, CAPA owner, investigator,
 * verifier, triage assignee, etc.) to a display name via
 * GET /incident/his/employee/:id. Cached aggressively since names rarely
 * change; a missing/placeholder/malformed id resolves to `null` rather than
 * erroring so callers can fall back to showing the raw id.
 */
export const useEmployeeName = (id?: string | null) => {
  const isResolvable = !!id && UUID_RE.test(id) && id !== NIL_UUID;

  const query = useQuery({
    queryKey: ['incident', 'employee', id],
    queryFn: () => incidentApi.resolveEmployee(id as string),
    enabled: isResolvable,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  return {
    name: query.data?.name as string | undefined,
    isLoading: isResolvable && query.isLoading,
    notFound: isResolvable && query.isError,
  };
};
