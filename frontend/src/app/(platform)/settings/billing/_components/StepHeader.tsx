'use client';

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { alpha, useTheme, keyframes } from '@mui/material/styles';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';

const stepPop = keyframes`
  0% { transform: scale(0.7); }
  55% { transform: scale(1.18); }
  100% { transform: scale(1); }
`;

export interface StepHeaderProps {
  /** 1-indexed: 1 = choosing modules, 2 = has a selection/quote, 3 = checkout in progress */
  activeStep: 1 | 2 | 3;
}

const STEPS = [
  { label: 'Choose Modules', caption: 'Pick what your business needs' },
  { label: 'Choose Plan', caption: 'Monthly or yearly billing' },
  { label: 'Review & Subscribe', caption: 'Confirm and pay securely' },
];

export default function StepHeader({ activeStep }: StepHeaderProps) {
  const theme = useTheme();

  return (
    <Stack direction="row" alignItems="center" justifyContent="center" sx={{ maxWidth: 520, mx: 'auto', width: '100%' }}>
      {STEPS.map((step, idx) => {
        const stepNumber = idx + 1;
        const isComplete = stepNumber < activeStep;
        const isActive = stepNumber === activeStep;
        return (
          <Box key={step.label} sx={{ display: 'flex', alignItems: 'center', flex: idx < STEPS.length - 1 ? 1 : 'unset' }}>
            <Stack direction="row" alignItems="center" spacing={0.75}>
              <Box
                key={`${step.label}-${isComplete}-${isActive}`}
                sx={{
                  width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                  fontWeight: 700, fontSize: 12,
                  bgcolor: isComplete || isActive ? theme.palette.primary.main : alpha(theme.palette.text.primary, 0.06),
                  color: isComplete || isActive ? '#fff' : theme.palette.text.secondary,
                  boxShadow: isActive ? `0 0 0 3px ${alpha(theme.palette.primary.main, 0.12)}` : 'none',
                  transition: 'background-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease',
                  animation: isComplete || isActive ? `${stepPop} 0.32s cubic-bezier(0.34, 1.56, 0.64, 1)` : 'none',
                }}
              >
                {isComplete ? <CheckRoundedIcon sx={{ fontSize: 14 }} /> : stepNumber}
              </Box>
              <Typography
                variant="caption"
                fontWeight={isActive ? 700 : 600}
                color={isActive || isComplete ? 'text.primary' : 'text.secondary'}
                sx={{ whiteSpace: 'nowrap', fontSize: 12.5, transition: 'color 0.2s ease' }}
              >
                {step.label}
              </Typography>
            </Stack>
            {idx < STEPS.length - 1 && (
              <Box
                sx={{
                  flex: 1, height: 1.5, mx: 1.25, minWidth: 24,
                  position: 'relative',
                  bgcolor: theme.palette.divider,
                  overflow: 'hidden',
                  '&::after': {
                    content: '""',
                    position: 'absolute', inset: 0,
                    bgcolor: theme.palette.primary.main,
                    transform: isComplete ? 'scaleX(1)' : 'scaleX(0)',
                    transformOrigin: 'left',
                    transition: 'transform 0.35s ease',
                  },
                }}
              />
            )}
          </Box>
        );
      })}
    </Stack>
  );
}
