import React, { useMemo } from 'react';
import { Box, Typography, alpha, useTheme } from '@mui/material';

interface HeatmapRow {
  department: string;
  severity_code: string;
  count: string | number;
}

interface DepartmentHeatmapProps {
  data: HeatmapRow[];
}

const SEVERITY_ORDER = ['LOW', 'MODERATE', 'HIGH', 'CRITICAL', 'SENTINEL'];

export const DepartmentHeatmap: React.FC<DepartmentHeatmapProps> = ({ data }) => {
  const theme = useTheme();

  const { departments, severities, matrix, max } = useMemo(() => {
    const deptSet = new Set<string>();
    const sevSet = new Set<string>();
    const map = new Map<string, number>();
    let maxVal = 0;

    for (const row of data) {
      const dept = row.department || 'Unspecified';
      const sev = (row.severity_code || 'UNKNOWN').toUpperCase();
      const count = Number(row.count) || 0;
      deptSet.add(dept);
      sevSet.add(sev);
      map.set(`${dept}::${sev}`, count);
      if (count > maxVal) maxVal = count;
    }

    const severities = Array.from(sevSet).sort(
      (a, b) => (SEVERITY_ORDER.indexOf(a) === -1 ? 99 : SEVERITY_ORDER.indexOf(a)) - (SEVERITY_ORDER.indexOf(b) === -1 ? 99 : SEVERITY_ORDER.indexOf(b)),
    );
    const departments = Array.from(deptSet).sort();

    return { departments, severities, matrix: map, max: maxVal || 1 };
  }, [data]);

  if (departments.length === 0) return null;

  const colorFor = (count: number) => {
    if (count === 0) return alpha(theme.palette.grey[300], 0.3);
    const intensity = 0.15 + 0.75 * (count / max);
    return alpha(theme.palette.error.main, intensity);
  };

  return (
    <Box sx={{ overflowX: 'auto' }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: `160px repeat(${severities.length}, 72px)`, gap: 0.5, minWidth: 160 + severities.length * 72 }}>
        <Box />
        {severities.map((sev) => (
          <Typography key={sev} variant="caption" fontWeight={700} textAlign="center" color="text.secondary">
            {sev}
          </Typography>
        ))}
        {departments.map((dept) => (
          <React.Fragment key={dept}>
            <Typography variant="body2" fontWeight={600} sx={{ display: 'flex', alignItems: 'center' }}>
              {dept}
            </Typography>
            {severities.map((sev) => {
              const count = matrix.get(`${dept}::${sev}`) || 0;
              return (
                <Box
                  key={sev}
                  title={`${dept} / ${sev}: ${count}`}
                  sx={{
                    height: 40,
                    borderRadius: 1,
                    bgcolor: colorFor(count),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Typography variant="caption" fontWeight={700} color={count > max * 0.5 ? 'white' : 'text.primary'}>
                    {count || ''}
                  </Typography>
                </Box>
              );
            })}
          </React.Fragment>
        ))}
      </Box>
    </Box>
  );
};
