import React from 'react';
import { Box, Typography, Chip } from '@mui/material';

interface RepeatRow {
  category_id: string;
  department: string;
  count: string | number;
}

interface RepeatIncidentsTableProps {
  data: RepeatRow[];
  categoryNameById?: Record<string, string>;
}

export const RepeatIncidentsTable: React.FC<RepeatIncidentsTableProps> = ({ data, categoryNameById = {} }) => {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {data.map((row, idx) => (
        <Box
          key={`${row.category_id}-${row.department}-${idx}`}
          sx={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            px: 1.5, py: 1, borderRadius: 1.5,
            bgcolor: idx % 2 === 0 ? 'action.hover' : 'transparent',
          }}
        >
          <Box>
            <Typography variant="body2" fontWeight={600}>
              {categoryNameById[row.category_id] || row.category_id}
            </Typography>
            <Typography variant="caption" color="text.secondary">{row.department}</Typography>
          </Box>
          <Chip label={`${row.count}×`} size="small" color={Number(row.count) >= 5 ? 'error' : 'warning'} />
        </Box>
      ))}
    </Box>
  );
};
