import React, { useState } from 'react';
import { Box, Typography, Menu, MenuItem, Tooltip, CircularProgress } from '@mui/material';
import { useSnackbar } from 'notistack';
import { useIncidentRiskMatrix, useUpdateRiskMatrixCell } from '../../../hooks/incident/use-incident-settings';
import { getApiErrorMessage } from '../../../lib/utils/api-error';
import { IncidentRiskMatrixConfig } from '../../../types/incident.types';

const LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
const LEVEL_COLORS: Record<string, string> = {
  LOW: '#10B981',
  MEDIUM: '#F59E0B',
  HIGH: '#F97316',
  CRITICAL: '#EF4444',
};

const IMPACT_LABELS = ['Negligible', 'Minor', 'Moderate', 'Major', 'Catastrophic'];
const LIKELIHOOD_LABELS = ['Rare', 'Unlikely', 'Possible', 'Likely', 'Almost Certain'];

export const RiskMatrixEditor: React.FC = () => {
  const { data: matrix, isLoading } = useIncidentRiskMatrix();
  const updateCell = useUpdateRiskMatrixCell();
  const { enqueueSnackbar } = useSnackbar();
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [activeCell, setActiveCell] = useState<{ likelihood: number; impact: number } | null>(null);

  const findCell = (likelihood: number, impact: number): IncidentRiskMatrixConfig | undefined =>
    matrix?.find((m) => m.likelihood === likelihood && m.impact === impact);

  const handleCellClick = (e: React.MouseEvent<HTMLElement>, likelihood: number, impact: number) => {
    setActiveCell({ likelihood, impact });
    setMenuAnchor(e.currentTarget);
  };

  const handleSelectLevel = async (level: string) => {
    if (!activeCell) return;
    try {
      await updateCell.mutateAsync({ likelihood: activeCell.likelihood, impact: activeCell.impact, riskLevel: level, color: LEVEL_COLORS[level] });
      enqueueSnackbar('Risk matrix cell updated', { variant: 'success' });
    } catch (e) {
      enqueueSnackbar(getApiErrorMessage(e, 'Failed to update cell'), { variant: 'error' });
    }
    setMenuAnchor(null);
    setActiveCell(null);
  };

  if (isLoading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress size={28} /></Box>;
  }

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Click a cell to set the risk level for that likelihood &times; impact combination. Rows are likelihood (bottom to top), columns are impact.
      </Typography>
      <Box sx={{ display: 'inline-block' }}>
        <Box sx={{ display: 'flex', ml: '90px', mb: 0.5 }}>
          {IMPACT_LABELS.map((label, i) => (
            <Box key={i} sx={{ width: 88, textAlign: 'center' }}>
              <Typography variant="caption" color="text.secondary">{label}</Typography>
            </Box>
          ))}
        </Box>
        {[5, 4, 3, 2, 1].map((likelihood) => (
          <Box key={likelihood} sx={{ display: 'flex', alignItems: 'center' }}>
            <Box sx={{ width: 90, pr: 1, textAlign: 'right' }}>
              <Typography variant="caption" color="text.secondary">{LIKELIHOOD_LABELS[likelihood - 1]}</Typography>
            </Box>
            {[1, 2, 3, 4, 5].map((impact) => {
              const cell = findCell(likelihood, impact);
              const level = cell?.riskLevel;
              const color = cell?.color || (level ? LEVEL_COLORS[level] : '#E5E7EB');
              return (
                <Tooltip key={impact} title={`Likelihood ${likelihood} × Impact ${impact}${level ? ` — ${level}` : ' — unset'}`}>
                  <Box
                    onClick={(e) => handleCellClick(e, likelihood, impact)}
                    sx={{
                      width: 80, height: 48, m: '2px', borderRadius: 1, bgcolor: color,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                      color: level ? '#fff' : 'text.secondary', fontWeight: 600, fontSize: 12,
                      transition: 'transform 0.1s', '&:hover': { transform: 'scale(1.05)', boxShadow: 2 },
                    }}
                  >
                    {level || '—'}
                  </Box>
                </Tooltip>
              );
            })}
          </Box>
        ))}
      </Box>

      <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={() => setMenuAnchor(null)}>
        {LEVELS.map((level) => (
          <MenuItem key={level} onClick={() => handleSelectLevel(level)}>
            <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: LEVEL_COLORS[level], mr: 1.5 }} />
            {level}
          </MenuItem>
        ))}
      </Menu>
    </Box>
  );
};
